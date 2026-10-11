output "s3_bucket_name" {
  value = aws_s3_bucket.documents.id
}
output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}
output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
output "ecs_service_name" {
  value = aws_ecs_service.app.name
}
output "log_group_name" {
  value = aws_cloudwatch_log_group.app.name
}
output "task_role_arn" {
  value = aws_iam_role.task.arn
}
output "next_steps" {
  value = "Push the Docker image to the ECR repo, set desired_count=1, apply again, then find the task public IP in the ECS console and open http://<ip>:${var.container_port}/health"
}
