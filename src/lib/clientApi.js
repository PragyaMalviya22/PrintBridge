import axios from "axios";
const api = axios.create({ baseURL: "", timeout: 15000 });

export const getServerInfo   = () => api.get("/api/info").then(r => r.data);
export const getPrinters     = () => api.get("/api/printers").then(r => r.data);
export const getSettings     = () => api.get("/api/settings").then(r => r.data.settings);
export const saveSettings    = (s) => api.post("/api/settings", s).then(r => r.data);
export const printLabel      = (j) => api.post("/api/print", j).then(r => r.data);
export const testPrint       = (d) => api.post("/api/test-print", d).then(r => r.data);
export const addNetPrinter   = (d) => api.post("/api/network-printers", d).then(r => r.data);
export const removeNetPrinter = (d) => api.delete("/api/network-printers", { data: d }).then(r => r.data);
