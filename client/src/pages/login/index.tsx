import { useState, type FormEvent } from "react";
import client from "../../api/main";
import { Button, PasswordInput, Stack, TextInput, Form } from "@carbon/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Validation states
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Basic client-side validation
    const emailValid = /\S+@\S+\.\S+/.test(email);
    const passwordValid = password.length >= 8;

    setEmailInvalid(!emailValid);
    setPasswordInvalid(!passwordValid);

    if (!emailValid || !passwordValid) return;

    try {
      const res = await client.api.users.$post({
        json: { email, password },
      });

      if (res.status === 400) {
        const data = await res.json();
        console.log("Error:", data.message);
      } else if (res.status === 201) {
        const data = await res.json();
        console.log("Success:", data.message, data.user.email);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack>
      <Form onSubmit={handleSubmit}>
        <TextInput
          id="email"
          labelText="Email"
          placeholder="Enter your email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailInvalid(false);
          }}
          invalid={emailInvalid}
          invalidText="Please enter a valid email address."
        />
        <PasswordInput
          id="password"
          labelText="Password"
          placeholder="Enter your password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordInvalid(false);
          }}
          invalid={passwordInvalid}
          invalidText="Password must be at least 8 characters."
        />
        <Button type="submit" kind="primary" className="wide">
          Login
        </Button>
      </Form>
    </Stack>
  );
}
