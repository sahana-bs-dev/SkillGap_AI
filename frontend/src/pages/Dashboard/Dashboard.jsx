import { useAuth } from "../../context/AuthContext";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div style={{ padding: "3rem" }}>
      <h1>Welcome, {user?.name}</h1>
      <p>Logged in as {user?.email}</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}