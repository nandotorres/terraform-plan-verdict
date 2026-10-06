# CRITICAL (red): mass destruction AND a security regression (open to the world).
terraform {
  required_providers { local = { source = "hashicorp/local" } }
}
variable "phase" { default = "change" }
locals {
  base = var.phase == "base"
  cidr = local.base ? "10.0.0.0/8" : "0.0.0.0/0" # opened to the world on change
}

resource "terraform_data" "svc" {
  count            = 5
  triggers_replace = local.base ? "v1" : "rotated" # REPLACE x5
}
resource "local_file" "data" {
  count    = local.base ? 12 : 0 # DELETE x12
  content  = "payload-${count.index}"
  filename = "${path.module}/data_${count.index}.txt"
}
resource "local_file" "fw_ingress" {
  content  = jsonencode({ ingress_cidr = local.cidr })
  filename = "${path.module}/fw_ingress.json"
}
resource "local_file" "fw_admin" {
  content  = jsonencode({ admin_cidr = local.cidr })
  filename = "${path.module}/fw_admin.json"
}
