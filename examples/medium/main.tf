# MEDIUM (yellow): several additions plus in-place updates.
terraform {
  required_providers {
    random = { source = "hashicorp/random" }
    local  = { source = "hashicorp/local" }
  }
}
variable "phase" { default = "change" }
locals { base = var.phase == "base" }

resource "terraform_data" "svc" {
  count = 3
  input = local.base ? "v1" : "v2" # differs -> update
}
resource "random_pet" "name"  { count = 3 }
resource "random_pet" "extra" { count = local.base ? 0 : 6 } # new
resource "local_file" "cfg" {
  count    = local.base ? 0 : 4
  content  = "x${count.index}"
  filename = "${path.module}/cfg_${count.index}.txt"
}
