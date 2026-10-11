# Terraform for the SecureSure Claims Portal (workbook "Terraform" sheet: ECS + S3 + IAM role).
# Extras that make the app observable/deployable: ECR repo, CloudWatch log group + error alarm.
# Simplification: uses the account's DEFAULT VPC/subnets and no load balancer (the task gets a
# public IP). Set desired_count = 1 only AFTER pushing the Docker image (see README).

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_vpc" "default" {
  default = true
}
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  name   = "${var.project_name}-${var.environment}"
  image  = var.container_image != "" ? var.container_image : "${aws_ecr_repository.app.repository_url}:latest"
  tags   = { Project = var.project_name, Environment = var.environment, ManagedBy = "terraform" }
  llm_env = [
    { name = "LLM_PROVIDER", value = var.llm_provider },
    { name = "LLM_BASE_URL", value = var.llm_base_url },
    { name = "LLM_MODEL", value = var.llm_model },
    { name = "LLM_API_KEY", value = var.llm_api_key }
  ]
}

# ---------- S3: insurance claim documents (TF3) ----------
resource "aws_s3_bucket" "documents" {
  bucket        = "${local.name}-docs-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # lets `terraform destroy` succeed even if demo files were uploaded
  tags          = local.tags
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ---------- ECR: container image repository ----------
resource "aws_ecr_repository" "app" {
  name         = local.name
  force_delete = true
  tags         = local.tags
}

# ---------- CloudWatch: logs + error alarm (AC15) ----------
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7
  tags              = local.tags
}

# The app logs JSON lines like {"level":"error",...}; count them as a metric.
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "${local.name}-app-errors"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level = \"error\" }"
  metric_transformation {
    name      = "AppErrorCount"
    namespace = "SecureSure/Claims"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  alarm_name          = "${local.name}-app-errors"
  alarm_description   = "5 or more application errors within 5 minutes"
  namespace           = "SecureSure/Claims"
  metric_name         = "AppErrorCount"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  tags                = local.tags
}

# ---------- IAM (TF4) ----------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: lets ECS pull the image and write logs.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role: what the running app may do (least privilege: only this bucket).
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}
data "aws_iam_policy_document" "task_s3" {
  statement {
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }
}
resource "aws_iam_role_policy" "task_s3" {
  name   = "documents-bucket-access"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

# ---------- Network access ----------
resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Allow inbound app traffic"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

# ---------- ECS Fargate (TF2) ----------
resource "aws_ecs_cluster" "main" {
  name = local.name
  tags = local.tags
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  tags                     = local.tags

  container_definitions = jsonencode([
    {
      name         = "app"
      image        = local.image
      essential    = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment = concat([
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = aws_s3_bucket.documents.id },
        { name = "MONGODB_URI", value = var.mongodb_uri },
        { name = "JWT_SECRET", value = var.jwt_secret },
        { name = "LLM_PROVIDER", value = var.llm_provider },
        { name = "CORS_ORIGIN", value = var.cors_origin },
      ], local.llm_env)
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  tags            = local.tags

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }
}
