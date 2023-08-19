export default function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="text-red-300 hover:text-red-200">Logout</button>
    </form>
  );
}
