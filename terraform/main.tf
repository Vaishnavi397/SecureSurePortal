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
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# data "aws_vpc" "default" {
#   default = true
# }
# data "aws_subnets" "default" {
#   filter {
#     name   = "vpc-id"
#     values = [data.aws_vpc.default.id]
#   }
# }

locals {
  name          = "${var.project_name}-${var.environment}"
  secret_prefix = "/${local.name}"
  tags          = { Project = var.project_name, Environment = var.environment, ManagedBy = "terraform" }
}

# Package the Lambda build folder into a ZIP file.
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/lambda-build"
  output_path = "${path.module}/.terraform/lambda-deployment.zip"
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

# --------------------------------------------------
# SSM Parameter Store: application secrets
# --------------------------------------------------

resource "aws_ssm_parameter" "mongodb_uri" {
  name  = "${local.secret_prefix}/MONGODB_URI"
  type  = "SecureString"
  value = var.mongodb_uri
  tags  = local.tags
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "${local.secret_prefix}/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret
  tags  = local.tags
}

resource "aws_ssm_parameter" "llm_api_key" {
  name  = "${local.secret_prefix}/LLM_API_KEY"
  type  = "SecureString"
  value = var.llm_api_key
  tags  = local.tags
}

resource "aws_ssm_parameter" "llm_base_url" {
  name  = "${local.secret_prefix}/LLM_BASE_URL"
  type  = "SecureString"
  value = var.llm_base_url
  tags  = local.tags
}

resource "aws_ssm_parameter" "llm_model" {
  name  = "${local.secret_prefix}/LLM_MODEL"
  type  = "SecureString"
  value = var.llm_model
  tags  = local.tags
}

# ---------- CloudWatch: logs + error alarm (AC15) ----------
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${local.name}"
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
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Execution role: lets Lambda pull the image and write logs.
resource "aws_iam_role" "lambda" {
  name               = "${local.name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "lambda_access" {
  name = "${local.name}-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          aws_ssm_parameter.mongodb_uri.arn,
          aws_ssm_parameter.jwt_secret.arn,
          aws_ssm_parameter.llm_api_key.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.documents.arn
      },
      {
        # Needed for the backend's asynchronous assessment job.
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name}"
      }
    ]
  })
}

# --------------------------------------------------
# Lambda: Node.js backend
# --------------------------------------------------

resource "aws_lambda_function" "app" {
  function_name = local.name
  description   = "SecureSure insurance claims API"
  role          = aws_iam_role.lambda.arn

  runtime       = "nodejs22.x"
  handler       = "src/lambda.handler"
  architectures = ["arm64"]

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  memory_size = 1024
  timeout     = 120

  environment {
    variables = {
      NODE_ENV            = "production"
      SECRETS_SSM_PREFIX  = local.secret_prefix
      S3_BUCKET           = aws_s3_bucket.documents.id
      CORS_ORIGIN         = var.cors_origin
      LLM_PROVIDER        = var.llm_provider
      LLM_BASE_URL        = var.llm_base_url
      LLM_MODEL           = var.llm_model
      LLM_TIMEOUT_MS      = "120000"
      EMBEDDINGS_PROVIDER = "local"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_logs,
    aws_iam_role_policy.lambda_access,
    aws_cloudwatch_log_group.app
  ]

  tags = local.tags
}

# --------------------------------------------------
# API Gateway: public HTTP endpoint
# --------------------------------------------------

resource "aws_apigatewayv2_api" "app" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [var.cors_origin]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 300
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.app.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.app.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.app.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.app.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.app.id
  name        = "$default"
  auto_deploy = true

  tags = local.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.app.execution_arn}/*/*"
}

# ---------- Network access ----------
# resource "aws_security_group" "app" {
#   name        = "${local.name}-app"
#   description = "Allow inbound app traffic"
#   vpc_id      = data.aws_vpc.default.id

#   ingress {
#     from_port   = var.container_port
#     to_port     = var.container_port
#     protocol    = "tcp"
#     cidr_blocks = [var.allowed_cidr]
#   }
#   egress {
#     from_port   = 0
#     to_port     = 0
#     protocol    = "-1"
#     cidr_blocks = ["0.0.0.0/0"]
#   }
#   tags = local.tags
# }
