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
} from 'npm:@react-email/components@0.0.22';
import * as React from 'npm:react@18.3.1';

interface MagicLinkEmailProps {
  locale: string;
  supabase_url: string;
  email_action_type: string;
  redirect_to: string;
  token_hash: string;
  token: string;
}

/** Translations of the text for English */
const translationsEn = {
  preview: 'Log in with this magic link',
  heading: 'Login',
  click_here: 'Click here to log in with this magic link',
  copy_and_paste: 'Or, copy and paste this temporary login code:',
  if_you_did_not_request:
    "If you didn't try to login, you can safely ignore this email.",
  footer: 'Tuturuuu, Empower your workflows, stress-free.',
  tagline:
    'Your intelligent shortcut\nTake control of workflows, supercharged by AI.',
  blog: 'Our blog',
  about: 'About us',
  contact: 'Contact us',
};

/** Translations of the text for Vietnamese */
const translationsVi = {
  preview: 'Đăng nhập với liên kết ma thuật này',
  heading: 'Đăng nhập',
  click_here: 'Nhấp vào đây để đăng nhập với liên kết ma thuật này',
  copy_and_paste: 'Hoặc, sao chép và dán mã đăng nhập tạm thời này:',
  if_you_did_not_request:
    'Nếu bạn không yêu cầu đăng nhập, bạn có thể bỏ qua email này.',
  footer: 'Tuturuuu, Tạo lối tắt thông minh cho công việc của bạn.',
  tagline: 'Lối tắt thông minh của bạn\nQuản lý công việc, siêu tốc độ cùng AI',
  blog: 'Blog của chúng tôi',
  about: 'Về chúng tôi',
  contact: 'Liên hệ',
};

export const MagicLinkEmail = ({
  locale,
  token,
  // supabase_url,
  // email_action_type,
  // redirect_to,
  // token_hash,
}: MagicLinkEmailProps) => {
  const translations = locale?.includes('vi') ? translationsVi : translationsEn;

  return (
    <Html>
      <Head />
      <Preview>{translations.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{translations.heading}</Heading>
          <Section style={code}>
            <Text style={confirmationCodeText}>{token}</Text>
          </Section>
          <Text
            style={{
              ...text,
              color: '#ababab',
              marginTop: '14px',
              marginBottom: '16px',
            }}
          >
            {translations.if_you_did_not_request}
          </Text>
          <Text style={footer}>
            <Link
              href="https://tuturuuu.com"
              target="_blank"
              style={{ ...link, color: '#898989' }}
            >
              {translations.footer}
            </Link>
          </Text>
          <Text style={footer}>{translations.tagline}</Text>
          <Section>
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
        </Container>
      </Body>
    </Html>
  );
};

export default MagicLinkEmail;

const main = {
  backgroundColor: '#ffffff',
};

const container = {
  paddingLeft: '12px',
  paddingRight: '12px',
  margin: '0 auto',
};

const h1 = {
  color: '#333',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
};

const link = {
  color: '#2754C5',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '14px',
  textDecoration: 'underline',
};

const text = {
  color: '#333',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '14px',
  margin: '24px 0',
};

const footer = {
  color: '#898989',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '12px',
  lineHeight: '22px',
  marginTop: '12px',
  marginBottom: '24px',
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

const footerLink = {
  color: '#898989',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: '12px',
  textDecoration: 'none',
};
