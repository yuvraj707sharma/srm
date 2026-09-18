import smtplib
from email.message import EmailMessage
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

def send_otp_email(to_email: str, otp_code: str):
    if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        logger.error("SMTP credentials are not fully configured in environment variables.")
        return False

    # Format digits into HTML cards
    digit_cells = "".join(
        f'<td style="padding: 0 4px;">'
        f'<div class="digit-box" style="width: 42px; height: 52px; line-height: 52px; font-size: 26px; font-weight: 800; color: #38bdf8; background-color: #0f172a; border: 2px solid #2563eb; border-radius: 10px; text-align: center; font-family: \'Courier New\', monospace; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); text-shadow: 0 0 8px rgba(56, 189, 248, 0.6);">'
        f'{digit}'
        f'</div></td>'
        for digit in str(otp_code)
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JECRC Medical College Hospital &amp; Research Centre - Security Verification Code</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    @keyframes pulseGlow {{
      0% {{ box-shadow: 0 0 15px rgba(37, 99, 235, 0.4); border-color: #3b82f6; }}
      50% {{ box-shadow: 0 0 25px rgba(56, 189, 248, 0.7); border-color: #38bdf8; }}
      100% {{ box-shadow: 0 0 15px rgba(37, 99, 235, 0.4); border-color: #3b82f6; }}
    }}
    
    @keyframes floatIcon {{
      0% {{ transform: translateY(0px); }}
      50% {{ transform: translateY(-4px); }}
      100% {{ transform: translateY(0px); }}
    }}

    .digit-box {{
      animation: pulseGlow 2.5s infinite ease-in-out;
    }}
    .shield-icon {{
      animation: floatIcon 3s infinite ease-in-out;
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: #f1f5f9;">
  
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 10px;">
    <tr>
      <td align="center">
        
        <!-- Main Email Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #1e293b; border-radius: 20px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Gradient Accent Bar -->
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 50%, #6366f1 100%);"></td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td style="padding: 36px 40px 24px 40px; text-align: center; background: linear-gradient(180deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%); border-bottom: 1px solid #334155;">
              
              <!-- Brand Badge -->
              <div style="display: inline-block; padding: 6px 16px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 50px; margin-bottom: 16px;">
                <span style="font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 1.5px;">JECRC MEDICAL COLLEGE HOSPITAL &amp; RESEARCH CENTRE (A UNIT OF JECRC)</span>
              </div>
              
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Verification Required</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">Use the One-Time Password below to authorize your session</p>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 36px 40px 28px 40px; background-color: #0f172a; text-align: center;">
              
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                Hello, <br>
                Please enter the following 6-digit code to complete your security verification:
              </p>

              <!-- OTP Digits Container -->
              <div style="margin: 28px 0;">
                <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                  <tr>
                    {digit_cells}
                  </tr>
                </table>
              </div>

              <!-- Expiry Pill -->
              <div style="display: inline-flex; align-items: center; justify-content: center; background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 50px; padding: 8px 18px; margin-top: 12px;">
                <span style="font-size: 13px; font-weight: 600; color: #fde047;">⏱️ Valid for 10 minutes only</span>
              </div>

            </td>
          </tr>

          <!-- Security Tip Callout -->
          <tr>
            <td style="padding: 0 40px 32px 40px; background-color: #0f172a;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.6); border: 1px solid #1e293b; border-left: 4px solid #3b82f6; border-radius: 12px; padding: 16px 20px;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                      <strong style="color: #f1f5f9;">🔒 Security Advisory:</strong> Do not share this OTP with anyone, including JECRC personnel. Our team will never ask for your verification code.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding: 24px 40px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 500;">
                JECRC Supply Chain Management System &bull; Official Communication
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                If you did not request this OTP, please ignore this email or contact support.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = f"🔐 {otp_code} is your Verification Code - JECRC Medical College Hospital & Research Centre"
    msg["From"] = f"JECRC Medical College Hospital & Research Centre <{settings.SMTP_USERNAME}>"
    msg["To"] = to_email

    # Plain text fallback for non-HTML email clients
    plain_text = (
        f"JECRC MEDICAL COLLEGE HOSPITAL & RESEARCH CENTRE (A UNIT OF JECRC) - VERIFICATION CODE\n\n"
        f"Your OTP code is: {otp_code}\n\n"
        f"This code will expire in 10 minutes.\n"
        f"Do not share this code with anyone for your security."
    )
    msg.set_content(plain_text)

    # Attach HTML alternative
    msg.add_alternative(html_content, subtype="html")

    try:
        # LOG OTP to console to help bypass network firewalls during testing
        logger.warning(f"\n============================================\n[LOCAL DEV] OTP CODE FOR {to_email}: {otp_code}\n============================================\n")

        # Use SMTP_SSL for port 465 or standard SMTP with STARTTLS for 587
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587)
            server.starttls()

        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Successfully sent animated OTP HTML email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


def send_boq_invitation_email(
    to_email: str,
    vendor_name: str,
    tender_number: str,
    tender_title: str,
    department: str | None,
    deadline_str: str,
    boq_id: str
):
    """Sends notification email to vendor about newly published BOQ tender with deadline."""
    if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        logger.warning("SMTP credentials are not fully configured; skipping email.")
        return False

    portal_link = f"http://localhost:3000/vendor/tenders/{boq_id}"
    dept_label = department or "Procurement & Equipment"

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>New Tender Published - JECRC SCM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #2563eb, #3b82f6, #06b6d4);"></td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">JECRC Medical College Hospital &amp; Research Centre (A Unit of JECRC)</div>
              <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #ffffff;">New BOQ Tender Published</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                Dear <strong>{vendor_name}</strong>,<br><br>
                You have been invited to participate in the competitive bidding for the following procurement tender:
              </p>
              
              <table width="100%" style="background-color: #0f172a; border-radius: 10px; border: 1px solid #334155; margin-bottom: 24px; padding: 16px;">
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding: 6px 0;">Tender Ref:</td>
                  <td style="color: #38bdf8; font-size: 13px; font-weight: 700; padding: 6px 0;">{tender_number or 'JECRC-BOQ-' + boq_id[:8].upper()}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding: 6px 0;">Project Title:</td>
                  <td style="color: #ffffff; font-size: 13px; font-weight: 600; padding: 6px 0;">{tender_title}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding: 6px 0;">Department:</td>
                  <td style="color: #cbd5e1; font-size: 13px; padding: 6px 0;">{dept_label}</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; font-size: 12px; padding: 6px 0;">Submission Deadline:</td>
                  <td style="color: #f59e0b; font-size: 13px; font-weight: 700; padding: 6px 0;">⏳ {deadline_str} (Strict Time-Lock)</td>
                </tr>
              </table>

              <div style="background-color: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
                <p style="color: #fbbf24; font-size: 12px; margin: 0; line-height: 1.5;">
                  <strong>Note:</strong> Bids must be submitted before the deadline lock. You can submit via web form, download the Excel sheet, or upload signed PDF quotation. Once submitted, your bid is permanently locked.
                </p>
              </div>

              <div style="text-align: center;">
                <a href="{portal_link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                  View BOQ & Submit Bid →
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; border-top: 1px solid #1e293b; color: #64748b; font-size: 11px;">
              JECRC Medical College & Hospital Procurement Committee • Automated Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = f"🔔 Tender Invitation: {tender_title} [{tender_number or boq_id[:8]}]"
    msg["From"] = f"JECRC Medical College Hospital & Research Centre <{settings.SMTP_USERNAME}>"
    msg["To"] = to_email

    plain_text = (
        f"NEW TENDER INVITATION - JECRC MEDICAL COLLEGE HOSPITAL & RESEARCH CENTRE (A UNIT OF JECRC)\n\n"
        f"Dear {vendor_name},\n"
        f"You are invited to bid for: {tender_title}\n"
        f"Tender Ref: {tender_number or boq_id[:8]}\n"
        f"Deadline: {deadline_str}\n\n"
        f"Access the tender portal: {portal_link}\n"
    )
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")

    try:
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587)
            server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Successfully sent BOQ invitation email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send BOQ invitation email to {to_email}: {str(e)}")
        return False


def send_vendor_invitation_email(
    to_email: str,
    vendor_name: str,
    contact_person: str = None,
    custom_message: str = None,
    registration_link: str = "http://localhost:3000/vendor/registration"
) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        logger.warning("SMTP credentials not fully configured; invitation logged to stdout.")
        logger.info(f"[SIMULATED EMAIL] Invitation to {to_email} for {vendor_name}")
        return True

    person_greeting = f"Dear {contact_person}," if contact_person else f"Dear {vendor_name} Procurement / Sales Team,"
    custom_para = f"<p style='color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 20px; background: #0f172a; padding: 14px; border-radius: 8px; border-left: 3px solid #38bdf8;'><em>\"{custom_message}\"</em></p>" if custom_message else ""

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vendor Registration Invitation - JECRC Medical College & Hospital</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #3b82f6, #6366f1, #a855f7);"></td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 12px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">JECRC Medical College & Hospital</div>
              <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #ffffff;">Invitation to Register as an Approved Vendor</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                {person_greeting}<br><br>
                Through our market intelligence discovery, <strong>{vendor_name}</strong> has been identified as a qualified manufacturer / supplier for our ongoing and upcoming healthcare and hospital procurement projects.
              </p>
              
              {custom_para}

              <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 24px;">
                We invite your organization to complete onboarding on our digital procurement portal. Once registered and approved, you will receive real-time BOQ tender invitations, direct RFQs, and participate in time-lock bidding.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="{registration_link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                  Register Your Organization Now →
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; border-top: 1px solid #1e293b; color: #64748b; font-size: 11px;">
              JECRC University & Hospital Procurement Committee • Automated Supplier Invitation
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = f"🤝 Official Vendor Invitation: JECRC Medical College & Hospital Procurement Portal - {vendor_name}"
    msg["From"] = f"JECRC Procurement <{settings.SMTP_USERNAME}>"
    msg["To"] = to_email

    plain_text = (
        f"OFFICIAL VENDOR INVITATION - JECRC SCM PORTAL\n\n"
        f"{person_greeting}\n\n"
        f"Through our market intelligence discovery, {vendor_name} has been identified as a qualified supplier for JECRC Medical College & Hospital.\n\n"
        f"Register here: {registration_link}\n"
    )
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")

    try:
        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587)
            server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Successfully sent vendor invitation email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send vendor invitation email to {to_email}: {str(e)}")
        return False


