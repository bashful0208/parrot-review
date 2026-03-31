export const validateEmail = (email: string): string | null => {
  if (!email || email.trim() === "") {
    return "邮箱不能为空";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "邮箱格式不正确";
  }
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password || password.trim() === "") {
    return "密码不能为空";
  }
  if (password.length < 6) {
    return "密码长度至少6位";
  }
  return null;
};
