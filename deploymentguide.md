# Continuous Integration and Continuous Deployment (CI/CD) Guide: GitHub to AWS EC2

This guide provides a comprehensive, step-by-step walkthrough to automate the deployment of your application to an AWS EC2 instance. Whenever you push code to the `main` branch of your GitHub repository, a GitHub Actions pipeline will automatically trigger, connect to your EC2 instance, and deploy the new build.

---

## Prerequisites
1. An active **AWS Account**.
2. A **GitHub Repository** containing your project code.
3. Git installed on your local machine.

---

## Step 1: Launch and Configure an AWS EC2 Instance

1. **Log in to AWS Console:** Navigate to the AWS Management Console and open the **EC2 Dashboard**.
2. **Launch Instance:** Click on **"Launch Instance"**.
3. **Name your Instance:** Give your instance a recognizable name (e.g., `ai-avatar-backend`).
4. **Choose an AMI (Amazon Machine Image):** Select **Ubuntu Server 24.04 LTS** (or 22.04 LTS) as it is widely supported and easy to use.
5. **Choose Instance Type:** Select `t2.micro` (eligible for free tier) or a larger instance if your application demands more resources.
6. **Key Pair (Login):**
   * Click **"Create new key pair"**.
   * Name it (e.g., `ec2-deploy-key`).
   * Select **RSA** and **.pem** format.
   * Click **"Create key pair"**. This will download the `.pem` file to your computer. **Keep this file secure; you will need it later.**
7. **Network Settings (Security Group):**
   * Check **"Allow SSH traffic from Anywhere"** (Port 22). *Note: For production, you might restrict this to GitHub Action IP ranges, though "Anywhere" is easier for initial setup.*
   * Check **"Allow HTTP traffic from the internet"** (Port 80).
   * Check **"Allow HTTPS traffic from the internet"** (Port 443).
   * *Custom TCP:* Add a rule for Port `8000` (if you run your FastAPI app directly on 8000 without a reverse proxy like Nginx).
8. **Storage:** Keep the default or increase it if you need more space for image/video processing.
9. **Launch:** Click **"Launch Instance"**.

---

## Step 2: Prepare the EC2 Instance

1. **Connect to your EC2 instance:**
   Open your terminal and SSH into the instance using the downloaded `.pem` file and the Public IPv4 address of your instance.
   ```bash
   chmod 400 /path/to/ec2-deploy-key.pem
   ssh -i /path/to/ec2-deploy-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
   ```

2. **Update the system:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Install required dependencies:**
   *(Tailored for your Python/FastAPI backend)*
   ```bash
   sudo apt install python3-pip python3-venv git -y
   ```

4. **Clone your GitHub repository initially:**
   You need to clone the repo on the server once manually so the CI/CD pipeline knows where to pull updates.
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   cd YOUR_REPOSITORY
   ```
   *(If your repo is private, you may need to use a Personal Access Token (PAT) or set up SSH deploy keys on the EC2 instance for GitHub).*

5. **Set up the Python Virtual Environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

6. **Create a `.env` file on the server:**
   Your server needs the environment variables.
   ```bash
   nano .env
   ```
   *Paste your environment variables (Supabase keys, Gemini keys, Stripe keys, etc.), then save and exit (Ctrl+O, Enter, Ctrl+X).*

7. **Create a Systemd Service (Optional but Recommended):**
   To keep your FastAPI app running in the background and restart automatically, create a systemd service.
   ```bash
   sudo nano /etc/systemd/system/fastapi.service
   ```
   *Add the following content (adjust paths accordingly):*
   ```ini
   [Unit]
   Description=FastAPI Application
   After=network.target

   [Service]
   User=ubuntu
   WorkingDirectory=/home/ubuntu/YOUR_REPOSITORY
   Environment="PATH=/home/ubuntu/YOUR_REPOSITORY/venv/bin"
   ExecStart=/home/ubuntu/YOUR_REPOSITORY/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   *Start the service:*
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start fastapi
   sudo systemctl enable fastapi
   ```

---

## Step 3: Configure GitHub Repository Secrets

Your GitHub Actions pipeline needs the credentials to access your EC2 instance. We will store these securely in GitHub Secrets.

1. Go to your repository on **GitHub**.
2. Click on **Settings** > **Secrets and variables** > **Actions**.
3. Click on **New repository secret**.
4. Add the following secrets:
   * **`EC2_HOST`**: The Public IPv4 address of your EC2 instance (e.g., `192.168.1.1`).
   * **`EC2_USERNAME`**: The username of the EC2 instance (for Ubuntu instances, it is `ubuntu`).
   * **`EC2_SSH_KEY`**: The complete contents of your `.pem` key file. 
     * *Open your `.pem` file in a text editor, copy everything (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`), and paste it as the value.*

---

## Step 4: Create the GitHub Actions CI/CD Pipeline

Now, we define the workflow in your code repository.

1. In the root directory of your project on your local machine, create a `.github/workflows` directory:
   ```bash
   mkdir -p .github/workflows
   ```
2. Create a file named `deploy.yml` inside that directory:
   ```bash
   touch .github/workflows/deploy.yml
   ```
3. Add the following code to `deploy.yml`:

```yaml
name: Deploy to EC2 on Push

# Trigger the workflow only and whenever there is a push to the 'main' branch
on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy code to EC2
    runs-on: ubuntu-latest

    steps:
      - name: Checkout local repository
        uses: actions/checkout@v4

      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          # The script to run on the EC2 instance after connecting
          script: |
            # Navigate to the project directory
            cd /home/ubuntu/YOUR_REPOSITORY
            
            # Discard any local changes on the server just in case
            git reset --hard
            
            # Pull the latest code from the main branch
            git pull origin main
            
            # Activate the virtual environment and install new dependencies
            source venv/bin/activate
            pip install -r requirements.txt
            
            # Restart the FastAPI service to apply new code
            sudo systemctl restart fastapi
```
*(Make sure to replace `YOUR_REPOSITORY` with the actual folder name on your EC2 instance).*

---

## Step 5: Test the CI/CD Pipeline

1. On your local machine, add, commit, and push the new `.github/workflows/deploy.yml` file.
   ```bash
   git add .github/workflows/deploy.yml
   git commit -m "Add CI/CD pipeline for EC2 deployment"
   git push origin main
   ```
2. Go to your GitHub repository in the browser.
3. Click on the **"Actions"** tab.
4. You should see a workflow running named **"Deploy to EC2 on Push"**. 
5. Click on it to watch the progress. Once it completes successfully, your new code has been deployed to the EC2 server and the FastAPI server has been restarted!

## Process Summary
Whenever you make changes to your code and push it to the `main` branch, GitHub Actions will:
1. Spin up a temporary runner.
2. Log securely into your EC2 server using the provided SSH Key.
3. Pull the latest code using Git.
4. Install any new dependencies.
5. Restart the server process, automatically serving the newest version of your application.
