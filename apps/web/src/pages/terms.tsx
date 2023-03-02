import { ReactElement } from 'react'; 
import DefaultLayout from '../components/layouts/DefaultLayout';

const TermsPage = () => {
  return <div>Terms of service</div>;
};

TermsPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>;
};

export default TermsPage;
