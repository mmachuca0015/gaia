const express = require("express");
const cors = require("cors");
require("dotenv").config();

const studiosRouter = require("./routes/studios");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/studios", studiosRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
