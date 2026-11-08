import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), refresh: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, resend: vi.fn() } },
}));
vi.mock("@/lib/backend/account", () => ({ useAccount: () => ({ refresh: mocks.refresh }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
import { SignIn } from "./SignIn";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Connected sign-in interactions", () => {
  it("toggles password visibility without changing its value", () => {
    render(<SignIn />);
    const password = screen.getByLabelText("Password");
    fireEvent.change(password, { target: { value: "synthetic-only" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("synthetic-only");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });
  it("submits real auth flow, clears password and refreshes verified identity", async () => {
    mocks.signIn.mockResolvedValue({ error: null });
    mocks.refresh.mockResolvedValue(undefined);
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "synthetic@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-only" } });
    fireEvent.submit(
      screen.getByRole("button", { name: "Sign in" }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "synthetic@example.test",
      password: "synthetic-only",
    });
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
  it("does not refresh identity after rejected credentials and allows retry", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "synthetic denial" } });
    render(<SignIn />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Sign in" }).closest("form") as HTMLFormElement,
    );
    await screen.findByRole("alert");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
  it("signup sends only email and password (no role or metadata) and shows verification state", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-long-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "synthetic-long-1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form") as HTMLFormElement);
    await screen.findByText("Check your email");
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    const arg = mocks.signUp.mock.calls[0]![0];
    expect(Object.keys(arg).sort()).toEqual(["email", "options", "password"]);
    expect(Object.keys(arg.options)).toEqual(["emailRedirectTo"]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("signup rejects mismatched or short passwords before contacting the server", async () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form") as HTMLFormElement);
    expect((await screen.findByRole("alert")).textContent).toMatch(/10 characters/);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-long-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "synthetic-long-2" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/do not match/));
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
