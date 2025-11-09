import {BrowserRouter, Routes, Route} from "react-router";
import "./App.css";

import Index from "./pages";
import LoginPage from "./pages/login";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />}/>
        <Route path="/auth" element={<LoginPage />}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
