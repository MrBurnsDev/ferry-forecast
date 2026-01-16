/**
 * Auth Components
 *
 * UI components for Google and Apple OAuth authentication.
 * Facebook has been intentionally removed.
 *
 * Phase 96: Includes OAuth safety detection for iOS PWA/WebView blocking.
 */

export { SignInButtons, GoogleIcon, AppleIcon } from './SignInButtons';
export { AuthGate, AuthGateInline } from './AuthGate';
export { UserMenu, UserAvatar } from './UserMenu';
export { AccountButton } from './AccountButton';
export { OAuthBlockedModal } from './OAuthBlockedModal';
