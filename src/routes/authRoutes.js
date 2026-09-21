const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// === ROTAS PÚBLICAS ===
const limites = require('../middlewares/limites');
router.post('/register', limites.cadastro, authController.register);
router.post('/login', limites.login, authController.login);

// === ROTAS DO CLIENTE LOGADO ===
router.get('/me', authMiddleware, authController.getMe);
router.put('/profile', authMiddleware, authController.updateProfile);
router.patch('/change-password', authMiddleware, authController.changePassword);
router.delete('/delete-account', authMiddleware, authController.deleteMyAccount);
router.post('/upload-avatar', authMiddleware, require('../middlewares/limites').upload, uploadMiddleware.avatar.single('avatar'), authController.uploadAvatar);

// === ROTAS PAINEL ADM (Requer ser Admin) ===
router.get('/admin/users', authMiddleware, adminMiddleware, authController.getAllUsers);
router.post('/admin/users', authMiddleware, adminMiddleware, authController.criarUsuarioAdmin);
router.get('/admin/users/:id_usuario', authMiddleware, adminMiddleware, authController.obterUsuarioAdmin);
router.post('/admin/promote/:id_usuario', authMiddleware, adminMiddleware, authController.promoteToAdmin);
router.delete('/admin/users/:id_usuario', authMiddleware, adminMiddleware, authController.adminDeleteUser);
router.put('/admin/users/:id_usuario', authMiddleware, adminMiddleware, authController.adminUpdateUser);
router.patch('/admin/demote/:id_usuario', authMiddleware, adminMiddleware, authController.demoteAdmin);
router.get('/admin/relatorio-demografico', authMiddleware, adminMiddleware, authController.relatorioDemografico);

module.exports = router;