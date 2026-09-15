const sendResponse = (res, data) => {
  const payload = {
    success: data.success,
    message: data.message,
    data: data.data,
  };

  if (typeof data?.meta !== "undefined") payload.meta = data.meta;
  if (typeof data?.results !== "undefined") payload.results = data.results;

  res.status(data?.statusCode).json(payload);
};

export default sendResponse;
