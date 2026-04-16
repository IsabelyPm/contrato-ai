const express = require("express");
const router = express.Router();
const contratoController = require("../controllers/contratoController");

router.get("/", (req, res) => {
    res.render("./pages/index"); 
});

// A rota de gerar agora chama o controller, e passaremos o ID do usuário lá
router.post("/gerar", contratoController.gerar);

module.exports = router;