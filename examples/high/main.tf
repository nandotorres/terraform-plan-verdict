# HIGH (orange): destructive plan — replacements plus many deletions.
terraform {
  required_providers {
    random = { source = "hashicorp/random" }
    local  = { source = "hashicorp/local" }
  }
}
variable "phase" { default = "change" }
locals { base = var.phase == "base" }

resource "terraform_data" "svc" {
  count            = 3
  triggers_replace = local.base ? "v1" : "rotated" # change -> REPLACE
}
resource "random_pet" "name"  { count = local.base ? 3 : 0 } # removed -> DELETE
resource "random_pet" "extra" { count = local.base ? 6 : 0 } # removed -> DELETE
resource "local_file" "cfg" {
  count    = local.base ? 4 : 0                              # removed -> DELETE
  content  = "x${count.index}"
  filename = "${path.module}/cfg_${count.index}.txt"
}
