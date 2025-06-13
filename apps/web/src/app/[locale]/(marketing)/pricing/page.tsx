import { redirect } from 'next/navigation';

function PricingPage() {
  redirect('/?hash-nav=1#pricing');
}

export default PricingPage;
