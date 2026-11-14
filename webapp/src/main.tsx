import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { tg } from "./api";
tg?.ready(); tg?.expand(); tg?.setHeaderColor?.("#0d0b14");
createRoot(document.getElementById("root")!).render(<App />);
