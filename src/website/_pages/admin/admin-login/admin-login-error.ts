export function adminLoginErrorMessage(status: number | undefined): string {
  switch (status) {
    case 401:
      return 'The password is incorrect. Please try again.';
    case 429:
      return 'Too many attempts. Please wait 15 minutes before trying again.';
    case 503:
      return 'Sign-in is not configured. Please contact a site administrator.';
    default:
      return 'Sign-in is temporarily unavailable. Please try again shortly.';
  }
}
