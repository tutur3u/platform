import { Button, Tailwind } from '@tuturuuu/transactional/react/email';

const Email = () => {
  return (
    <Tailwind>
      <Button
        href="https://example.com"
        className="rounded bg-black px-3 py-2 font-medium leading-4 text-white"
      >
        Click me
      </Button>
    </Tailwind>
  );
};

export default Email;
