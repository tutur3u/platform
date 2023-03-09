import { ReactElement, useState } from 'react';
import DefaultLayout from '../components/layouts/DefaultLayout';

const TermsPage = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const themeStyles = isDarkMode
    ? 'bg-gray-900 text-white'
    : 'bg-gray-100 text-gray-800';

  const themeToggleStyles = isDarkMode
    ? 'bg-gray-700 text-white'
    : 'bg-gray-200 text-gray-800';

  return (
    <div className={themeStyles}>
      <div className="max-w-5xl mx-auto py-10 px-4 sm:py-12 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mt-8 mb-4">Terms of Service</h1>
        <p className="mb-4">
          Welcome to Tuturuuu, a task management platform designed to help you
          stay organized and productive. Our platform offers a suite of features
          to help you streamline your tasks, manage your schedules, and keep
          track of your finances, all in one place.
        </p>
        <p className="mb-4">
          These terms and conditions ("Terms") govern your use of Tuturuuu's
          platform and services ("Service"), and any information, text,
          graphics, photos, or other materials uploaded, downloaded or appearing
          on the Service (collectively referred to as "Content"). By accessing
          or using the Service, you agree to be bound by these Terms.
        </p>
        <h2 className="mb-2 text-lg font-bold">1. Use of Service</h2>
        <p className="mb-4">
          You may use the Service for lawful purposes only. You agree not to use
          the Service in any way that violates any applicable federal, state,
          local, or international law or regulation (including, without
          limitation, any laws regarding the export of data or software to and
          from Vietnam or other countries).
        </p>
        <h2 className="mb-2 text-lg font-bold">2. Account and Security</h2>
        <p className="mb-4">
          In order to use the Service, you may be required to create an account.
          You are responsible for maintaining the confidentiality of your
          account and password, and for restricting access to your computer or
          mobile device. You agree to accept responsibility for all activities
          that occur under your account or password. Tuturuuu reserves the right
          to refuse service, terminate accounts, or remove or edit content in
          its sole discretion.
        </p>
        <h2 className="mb-2 text-lg font-bold">3. Intellectual Property</h2>
        <p className="mb-4">
          The Service and its entire contents, features, and functionality
          (including but not limited to all information, software, text,
          displays, images, video, and audio, and the design, selection, and
          arrangement thereof), are owned by Tuturuuu, its licensors, or other
          providers of such material and are protected by Vietnam and
          international copyright, trademark, patent, trade secret, and other
          intellectual property or proprietary rights laws.
        </p>
        <h2 className="mb-2 text-lg font-bold">4. Disclaimer of Warranties</h2>
        <p className="mb-4">
          The Service and all information, content, materials, products
          (including software) and services included on or otherwise made
          available to you through the Service are provided by Tuturu uu on an
          "as is" and "as available" basis, without any warranties of any kind,
          either express or implied, including but not limited to warranties of
          merchantability, fitness for a particular purpose, non-infringement,
          or course of performance.
        </p>
        <h2 className="mb-2 text-lg font-bold">5. Limitation of Liability</h2>
        <p className="mb-4">
          In no event shall Tuturuuu, its affiliates, licensors, service
          providers, or their officers, directors, employees, agents, licensors,
          or suppliers be liable for any indirect, incidental, special,
          consequential, or punitive damages, including, without limitation,
          loss of profits, data, use, goodwill, or other intangible losses,
          resulting from (i) your access to or use of or inability to access or
          use the Service; (ii) any conduct or content of any third party on the
          Service; (iii) any content obtained from the Service; and (iv)
          unauthorized access, use, or alteration of your transmissions or
          content, whether based on warranty, contract, tort (including
          negligence), or any other legal theory, whether or not we have been
          informed of the possibility of such damage, and even if a remedy set
          forth herein is found to have failed of its essential purpose.
        </p>
        <h2 className="mb-2 text-lg font-bold">
          6. Governing Law and Dispute Resolution
        </h2>
        <p className="mb-4">
          These Terms shall be governed by and construed in accordance with the
          laws of Vietnam, without giving effect to any principles of conflicts
          of law. Any dispute arising out of or relating to these Terms or the
          Service shall be resolved exclusively by the courts located in
          Vietnam.
        </p>
        <p className="mb-4">
          Thank you for choosing Tuturuuu! We hope you find our platform helpful
          in managing your tasks, schedules, and finances. If you have any
          questions or concerns about these Terms or the Service, please contact
          us at support@tuturuuu.com.
        </p>
      </div>
    </div>
  );
};

TermsPage.getLayout = (page: ReactElement) => (
  <DefaultLayout>{page}</DefaultLayout>
);

export default TermsPage;
