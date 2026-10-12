output "api_url" {
  description = "Public API Gateway endpoint"
  value       = aws_apigatewayv2_api.app.api_endpoint
}

output "lambda_function_name" {
  description = "Deployed backend Lambda function"
  value       = aws_lambda_function.app.function_name
}

output "s3_bucket_name" {
  description = "S3 bucket for insurance claim documents"
  value       = aws_s3_bucket.documents.id
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for the backend Lambda function"
  value       = aws_cloudwatch_log_group.app.name
}
