export const validateEmail = (email: string): string | null => {
  if (!email || email.trim() === "") {
    return "Email is required.";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password || password.trim() === "") {
    return "Password is required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  return null;
};

export const validateConfirmPassword = (
  password: string,
  confirmPassword: string
): string | null => {
  if (!confirmPassword || confirmPassword.trim() === "") {
    return "Please confirm your password.";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
};
