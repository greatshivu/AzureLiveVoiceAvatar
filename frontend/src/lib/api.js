import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const searchOrders = async (params) => {
  const { data } = await api.get("/orders/search", { params });
  return data;
};

export const searchItems = async (params) => {
  const { data } = await api.get("/items/search", { params });
  return data;
};

export const getConfig = async () => {
  const { data } = await api.get("/config");
  return data;
};

export const getAvatarCredentials = async () => {
  const { data } = await api.get("/avatar/credentials");
  return data;
};

export const sendChat = async (text, threadId) => {
  const { data } = await api.post("/avatar/chat", { text, thread_id: threadId });
  return data;
};
