export const getIdFromUrl = (url: string): string | undefined => {
  return new URL(url).pathname.split("/").pop();
};
