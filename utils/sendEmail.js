import nodemailer from "nodemailer";

export const sendEmail = async (to, subject, html) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: subject || "SnapNDesign Notification",
    html,
  });
};

// OTP email template
export const otpEmailTemplate = (otp, purpose = "verification") => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 30px; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1a1a2e; margin: 0;">SnapNDesign</h2>
        <p style="color: #6b7280; font-size: 14px;">Professional Kitchen Design & Supply</p>
      </div>
      <h3 style="color: #1a1a2e;">Your ${purpose} code</h3>
      <p style="color: #374151;">Use the following 6-digit code for ${purpose}. This code expires in 5 minutes.</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #b5884c; background: #fdf6ec; padding: 16px 32px; border-radius: 8px; display: inline-block;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 13px;">If you didn't request this, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="text-align: center; font-size: 12px; color: #9ca3af;">&copy; 2025 SnapNDesign. All rights reserved.</p>
    </div>
  `;
};

// Staff invite email template
export const staffInviteTemplate = (staffName, email, password) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 30px; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1a1a2e; margin: 0;">SnapNDesign</h2>
        <p style="color: #6b7280; font-size: 14px;">Professional Kitchen Design & Supply</p>
      </div>
      <h3 style="color: #1a1a2e;">Welcome, ${staffName}!</h3>
      <p style="color: #374151;">You have been added as a staff member. Here are your login credentials:</p>
      <div style="background: #fdf6ec; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 4px 0;"><strong>Temporary Password:</strong> ${password}</p>
      </div>
      <p style="color: #6b7280; font-size: 13px;">Please change your password after logging in.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="text-align: center; font-size: 12px; color: #9ca3af;">&copy; 2025 SnapNDesign. All rights reserved.</p>
    </div>
  `;
};
