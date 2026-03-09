import logging
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize the Resend client if we have an API key
if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY
else:
    logger.warning("RESEND_API_KEY is not set. Password reset emails will fail or only print to console in dev mode.")

def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """
    Send an email containing a password reset magic link.
    Returns True if successful, False otherwise.
    """
    subject = "Reset Your Password - AI Avatar Generator"
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset the password for your AI Avatar Generator account.</p>
        <p>If you made this request, click the button below to securely set a new password. This link will expire in 15 minutes.</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #007bff;">{reset_link}</p>
        <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">If you did not request a password reset, please ignore this email.</p>
    </div>
    """

    if not settings.RESEND_API_KEY:
        # Development fallback if key not properly loaded
        logger.info(f"[DEV EMAIL LOG] To: {to_email}")
        logger.info(f"[DEV EMAIL LOG] Subject: {subject}")
        logger.info(f"[DEV EMAIL LOG] Link: {reset_link}")
        return True

    try:
        # Note: resend requires a verified sending domain. If you do not have one,
        # you can only send emails to the email address registered with your Resend account.
        # Typically 'onboarding@resend.dev' works for testing if delivering to your own email.
        r = resend.Emails.send({
            "from": "support@horpen.ai",
            "to": to_email,
            "subject": subject,
            "html": html_content
        })
        logger.info(f"Password reset email dispatched to {to_email}. Response: {r}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {str(e)}")
        return False
