#!/usr/bin/env bash
# Create the API VM on GCP's free tier (e2-micro, us-central1) and open HTTP/HTTPS.
# Run once from your machine after `gcloud auth login` and `gcloud config set project <id>`.
set -euo pipefail

NAME="${NAME:-allocation-api}"
ZONE="${ZONE:-us-central1-a}"

gcloud compute instances create "$NAME" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --tags=http-server,https-server \
  --metadata-from-file=startup-script="$(dirname "$0")/../vm/setup.sh"

gcloud compute firewall-rules describe allow-http-https >/dev/null 2>&1 || \
  gcloud compute firewall-rules create allow-http-https \
    --allow=tcp:80,tcp:443 --target-tags=http-server,https-server

# Promote the VM's ephemeral IP to a static one so a stop/start can't break DNS.
# An in-use static address costs the same as an ephemeral one.
IP=$(gcloud compute instances describe "$NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
gcloud compute addresses describe "$NAME" --region="${ZONE%-*}" >/dev/null 2>&1 || \
  gcloud compute addresses create "$NAME" --addresses="$IP" --region="${ZONE%-*}"

echo "VM created. Point the api.calebweeks.com A record at $IP"
