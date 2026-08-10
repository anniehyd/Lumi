#!/usr/bin/env bash
# Provision a single EC2 box for Lumi: security group, key pair, t3.small
# (Ubuntu 24.04) with Docker preinstalled via user-data, and an Elastic IP.
#
# Usage: AWS_PROFILE=annie ./deploy/provision.sh [region]
set -euo pipefail

REGION="${1:-us-east-1}"
NAME=lumi
KEY_FILE="$HOME/.ssh/${NAME}-key.pem"

aws() { command aws --region "$REGION" "$@"; }

echo "==> Provisioning in $REGION as profile ${AWS_PROFILE:-default}"
aws sts get-caller-identity --query Arn --output text

# --- Key pair ---
if ! aws ec2 describe-key-pairs --key-names "$NAME-key" >/dev/null 2>&1; then
  aws ec2 create-key-pair --key-name "$NAME-key" \
    --query KeyMaterial --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "==> Key saved to $KEY_FILE"
fi

# --- Security group: SSH from your IP only; HTTP/HTTPS from anywhere ---
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values="$NAME-sg" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$NAME-sg" \
    --description "Lumi web + ssh" --vpc-id "$VPC_ID" \
    --query GroupId --output text)
  MY_IP=$(curl -s https://checkip.amazonaws.com)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "$MY_IP/32"
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0
  echo "==> Security group $SG_ID (SSH restricted to $MY_IP)"
fi

# --- Instance ---
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)

USER_DATA=$(cat <<'EOF'
#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu
EOF
)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.small \
  --key-name "$NAME-key" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --query 'Instances[0].InstanceId' --output text)
echo "==> Instance $INSTANCE_ID launching…"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# --- Elastic IP (stable address for DuckDNS) ---
ALLOC_ID=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" \
  --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].PublicIp' --output text)

echo ""
echo "==> DONE"
echo "    Instance:  $INSTANCE_ID"
echo "    Public IP: $PUBLIC_IP   <-- point your DuckDNS subdomain here"
echo "    SSH:       ssh -i $KEY_FILE ubuntu@$PUBLIC_IP"
