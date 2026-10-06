# LOW (green): a few additive changes, nothing destructive.
terraform {
  required_providers { random = { source = "hashicorp/random" } }
}
variable "phase" { default = "change" }
locals { base = var.phase == "base" }

resource "terraform_data" "svc" { count = local.base ? 0 : 3 }
resource "random_pet" "name"    { count = local.base ? 0 : 3 }
