import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },

    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    profileImage: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    // 'owner' = admin/designer (the business owner using the app)
    // 'staff' = sub-user created by owner
    role: {
      type: String,
      enum: ["owner", "staff"],
      default: "owner",
    },

    // staff is linked to an owner
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isSuspended: {
      type: Boolean,
      default: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    otp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    resetPasswordOtp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    // Notification preferences
    notifications: {
      push: { type: Boolean, default: true },
      loan: { type: Boolean, default: false },
      transaction: { type: Boolean, default: false },
      fund: { type: Boolean, default: true },
      support: { type: Boolean, default: false },
    },

    // Total jobs count (denormalized for quick display)
    totalJobs: {
      type: Number,
      default: 0,
    },

    memberSince: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.comparePassword = async function (plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

// Static helpers
userSchema.statics.isUserExistsByEmail = async function (email) {
  return await this.findOne({ email });
};

// OTP helpers
userSchema.methods.setOTP = function (code, expireMinutes = 5) {
  this.otp = {
    code,
    expiresAt: new Date(Date.now() + expireMinutes * 60 * 1000),
  };
};

userSchema.methods.clearOTP = function () {
  this.otp = { code: null, expiresAt: null };
};

userSchema.methods.isOTPValid = function (code) {
  return (
    this.otp?.code === code &&
    this.otp?.expiresAt &&
    this.otp.expiresAt > new Date()
  );
};

// Reset password OTP helpers
userSchema.methods.setResetPasswordOTP = function (code, expireMinutes = 5) {
  this.resetPasswordOtp = {
    code,
    expiresAt: new Date(Date.now() + expireMinutes * 60 * 1000),
  };
};

userSchema.methods.clearResetPasswordOTP = function () {
  this.resetPasswordOtp = { code: null, expiresAt: null };
};

userSchema.methods.isResetPasswordOTPValid = function (code) {
  return (
    this.resetPasswordOtp?.code === code &&
    this.resetPasswordOtp?.expiresAt &&
    this.resetPasswordOtp.expiresAt > new Date()
  );
};

// Hide sensitive fields in JSON response
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.resetPasswordOtp;
  delete obj.refreshToken;
  return obj;
};

const User = mongoose.model("User", userSchema);

export default User;
