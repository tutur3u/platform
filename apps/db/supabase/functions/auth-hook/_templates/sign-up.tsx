import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.34';
import * as React from 'npm:react@18.3.1';

interface SignUpEmailProps {
  locale: string;
  token: string;
  supabase_url: string;
  email_action_type: string;
  redirect_to: string;
  token_hash: string;
  origin?: string;
}

/** Translations of the text for English */
const translationsEn = {
  confirm_email_address: 'Confirm your email address',
  h1: (username: string) => `Welcome to Tuturuuu! Confirm your email address`,
  your_confirmation_code:
    'Thank you for signing up for Tuturuuu. Please complete the email confirmation for full access.',
  click_here: 'Click here to confirm your email address',
  copy_and_paste: 'Or, copy and paste this temporary login code:',
  if_you_did_not_request:
    'If you did not request this email, there is nothing to worry about, you can safely ignore it.',
  blog: 'Our blog',
  about: 'About us',
  contact: 'Contact us',
  tagline:
    'Your intelligent shortcut - take control of workflows, supercharged by AI.',
};

/** Translations of the text for Vietnamese */
const translationsVi = {
  confirm_email_address: 'Xác nhận địa chỉ email của bạn',
  h1: (username: string) =>
    `Chào mừng đến với Tuturuuu! Vui lòng xác nhận địa chỉ email của bạn`,
  your_confirmation_code:
    'Cảm ơn bạn đã đăng ký Tuturuuu. Vui lòng hoàn tất xác nhận email để truy cập đầy đủ.',
  click_here: 'Nhấp vào đây để xác nhận địa chỉ email của bạn',
  copy_and_paste: 'Hoặc, sao chép và dán mã đăng nhập tạm thời này:',
  if_you_did_not_request:
    'Nếu bạn không yêu cầu email này, bạn có thể bỏ qua nó.',
  blog: 'Blog của chúng tôi',
  about: 'Về chúng tôi',
  contact: 'Liên hệ',
  tagline:
    'Lối tắt thông minh của bạn - quản lý công việc, siêu tốc độ cùng AI',
};

const translationsAiseaEn = {
  confirm_email_address: 'Confirm your email address',
  h1: (username: string) => `Welcome to AISEA! Confirm your email address`,
  your_confirmation_code:
    'Thank you for signing up for AISEA. Please complete the email confirmation for full access.',
  click_here: 'Click here to confirm your email address',
  copy_and_paste: 'Or, copy and paste this temporary login code:',
  if_you_did_not_request:
    'If you did not request this email, there is nothing to worry about, you can safely ignore it.',
  blog: 'Our blog',
  about: 'About us',
  contact: 'Contact us',
  tagline:
    'Level up your learning journey - empower your school with AI-driven tools.',
};

const translationsAiseaVi = {
  confirm_email_address: 'Xác nhận địa chỉ email của bạn',
  h1: (username: string) =>
    `Chào mừng đến với AISEA! Vui lòng xác nhận địa chỉ email của bạn`,
  your_confirmation_code:
    'Cảm ơn bạn đã đăng ký AISEA. Vui lòng hoàn tất xác nhận email để truy cập đầy đủ.',
  click_here: 'Nhấp vào đây để xác nhận địa chỉ email của bạn',
  copy_and_paste: 'Hoặc, sao chép và dán mã đăng nhập tạm thời này:',
  if_you_did_not_request:
    'Nếu bạn không yêu cầu email này, bạn có thể bỏ qua nó.',
  blog: 'Blog của chúng tôi',
  about: 'Về chúng tôi',
  contact: 'Liên hệ',
  tagline:
    'Hành trình học tập của bạn - đẩy mạnh trường học của bạn với công cụ AI',
};

export const SignUpEmail = ({
  locale,
  token,
  // supabase_url,
  // email_action_type,
  // redirect_to,
  // token_hash,
  origin = 'TUTURUUU',
}: SignUpEmailProps) => {
  const translations =
    origin === 'AISEA'
      ? locale?.includes('vi')
        ? translationsAiseaVi
        : translationsAiseaEn
      : locale?.includes('vi')
        ? translationsVi
        : translationsEn;

  return (
    <Html>
      <Head />
      <Preview>{translations.confirm_email_address}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{translations.h1('')}</Heading>
          <Text style={heroText}>{translations.your_confirmation_code}</Text>

          <Section style={code}>
            <Text style={confirmationCodeText}>{token}</Text>
          </Section>

          <Text style={text}>{translations.if_you_did_not_request}</Text>

          {origin === 'TUTURUUU' && (
            <Section>
              <Text style={text}>{translations.tagline}</Text>
              <Link
                style={footerLink}
                href="https://tuturuuu.com/blog"
                target="_blank"
                rel="noopener noreferrer"
              >
                {translations.blog}
              </Link>
              &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
              <Link
                style={footerLink}
                href="https://tuturuuu.com/about"
                target="_blank"
                rel="noopener noreferrer"
              >
                {translations.about}
              </Link>
              &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
              <Link
                style={footerLink}
                href="https://tuturuuu.com/contact"
                target="_blank"
                rel="noopener noreferrer"
              >
                {translations.contact}
              </Link>
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
};

export default SignUpEmail;

const footerLink = {
  color: '#ffffff',
  textDecoration: 'underline',
};

const footerLogos = {
  marginBottom: '32px',
  paddingLeft: '8px',
  paddingRight: '8px',
  width: '100%',
};

const main = {
  backgroundColor: '#fce7f3',
  margin: '0 auto',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
};

const container = {
  margin: '0 auto',
  padding: '0px 20px',
};

const logoContainer = {
  marginTop: '32px',
};

const h1 = {
  color: '#9333ea',
  fontSize: '36px',
  fontWeight: '700',
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
};

const heroText = {
  fontSize: '20px',
  lineHeight: '28px',
  marginBottom: '30px',
};

const code = {
  display: 'inline-block',
  padding: '16px 4.5%',
  width: '90.5%',
  backgroundColor: '#f4f4f4',
  borderRadius: '5px',
  border: '1px solid #eee',
  color: '#333',
};

const confirmationCodeText = {
  fontSize: '30px',
  textAlign: 'center' as const,
  verticalAlign: 'middle',
};

const text = {
  color: '#000',
  fontSize: '14px',
  lineHeight: '24px',
};
