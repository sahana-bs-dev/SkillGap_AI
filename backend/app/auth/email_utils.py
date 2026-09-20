from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from app.config import SENDGRID_API_KEY, SENDGRID_FROM_EMAIL

def send_otp_email(to_email: str, otp: str):
    message = Mail(
        from_email=SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject="Your password reset code",
        html_content=f"<p>Your SkillGap AI password reset code is <strong>{otp}</strong>. It expires in 50 seconds.</p>",
    )
    sg = SendGridAPIClient(SENDGRID_API_KEY)
    sg.send(message)