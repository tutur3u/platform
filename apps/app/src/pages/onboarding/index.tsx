import { ReactElement } from 'react';
import DefaultLayout from '../../components/layout/DefaultLayout';
import OnboardingForm from '../../components/onboarding/OnboardingForm';

const OnboardingPage = () => {
  return (
    <>
      <OnboardingForm />
    </>
  );
};

OnboardingPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <DefaultLayout hideNavLinks hideFooter>
      {page}
    </DefaultLayout>
  );
};

export default OnboardingPage;
