variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  type    = string
  default = "securesure-claims"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "container_image" {
  description = "Full image URI. Leave empty to use <ecr repo>:latest created by this config."
  type        = string
  default     = ""
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "desired_count" {
  description = "Keep 0 for the first apply (no image pushed yet). Set to 1 after pushing the image."
  type        = number
  default     = 0
}

variable "allowed_cidr" {
  description = "CIDR allowed to reach the app. Restrict to your IP/32 if you can."
  type        = string
  default     = "0.0.0.0/0"
}

variable "cors_origin" {
  type    = string
  default = "*"
}

variable "llm_provider" {
  description = "openrouter | other providers"
  type        = string
  default     = "openrouter"
}

variable "llm_model" {
  description = "openrouter/free | other models"
  type        = string
  default     = "openrouter/free"
}

# ---- Secrets: supply via terraform.tfvars (git-ignored) or TF_VAR_* env vars. No defaults. ----
variable "mongodb_uri" {
  description = "MongoDB Atlas connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "llm_base_url" {
  type      = string
  sensitive = true
  default   = "https://openrouter.ai/api/v1"
}

variable "llm_api_key" {
  type      = string
  sensitive = true
  default   = ""
}
