const fs = require("fs");

const file = "contador.txt";

module.exports = function gerarNumeroContrato() {
  let numero = 1;

  if (fs.existsSync(file)) {
    numero = parseInt(fs.readFileSync(file)) + 1;
  }

  fs.writeFileSync(file, numero.toString());

  return numero.toString().padStart(3, "0");
};