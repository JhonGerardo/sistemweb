

// routes/visitas.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const moment = require('moment');

// Middleware de validación mejorado
const validarVisita = [
  body('cedula')
    .isLength({ min: 6, max: 20 }).withMessage('Cédula inválida (6-20 caracteres)')
    .matches(/^\d+$/).withMessage('Solo números permitidos'),
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('apellido').trim().notEmpty().withMessage('Apellido requerido'),
  body('empresa').trim().notEmpty().withMessage('Empresa requerida'),
  body('area').trim().notEmpty().withMessage('Área requerida'),
  body('elementos_ingresa').trim().notEmpty().withMessage('Elementos ingresados requeridos'),
  body('autoriza_ingreso').trim().notEmpty().withMessage('Autorizador requerido'),
  body('placa')
    .trim().notEmpty().withMessage('Placa requerida')
    .isLength({ max: 6 }).withMessage('Máximo 6 caracteres'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
  }
];

// POST /visitas - Registro completo
router.post('/', validarVisita, async (req, res) => {
  const connection = await req.pool.getConnection();
  try {
    await connection.beginTransaction();
    const { cedula, nombre, apellido, empresa, area, elementos_ingresa, autoriza_ingreso, placa } = req.body;
    
    // 1. Upsert en personas
    await connection.execute(
      `INSERT INTO personas (cedula, nombre, apellido, empresa)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre=VALUES(nombre), apellido=VALUES(apellido), empresa=VALUES(empresa)`,
      [cedula, nombre, apellido, empresa]
    );

    // 2. Obtener personaId
    const [[personaRow]] = await connection.execute(
      'SELECT id FROM personas WHERE cedula = ?', 
      [cedula]
    );
    const personaId = personaRow.id;

    // 3. Validación ARL mensual
    const inicioMes = moment.utc().startOf('month').format('YYYY-MM-DD');
    const finMes = moment.utc().endOf('month').format('YYYY-MM-DD');
    
    const [arlValida] = await connection.execute(
      `SELECT 1 FROM arl
       WHERE persona_id = ? AND mes_vigencia BETWEEN ? AND ? LIMIT 1`,
      [personaId, inicioMes, finMes]
    );
    
    if (!arlValida.length) {
      await connection.rollback();
      return res.status(400).json({
        error: 'ARL requerida para el mes actual',
        codigo: 'ARL_MENSUAL_REQUERIDA'
      });
    }

    // 4. Validación EPS vigente
    const hoyUTC = moment.utc().format('YYYY-MM-DD');
    const [epsValida] = await connection.execute(
      `SELECT fecha_vencimiento FROM eps
       WHERE persona_id = ? AND fecha_vencimiento >= ?
       ORDER BY fecha_vencimiento DESC LIMIT 1`,
      [personaId, hoyUTC]
    );
    
    if (!epsValida.length) {
      await connection.rollback();
      return res.status(400).json({
        error: 'EPS vencida o no registrada',
        codigo: 'EPS_REQUERIDA'
      });
    }

    // 5. Registrar visita
    const [visita] = await connection.execute(
      `INSERT INTO visitas (persona_id, area, elementos_ingresa, autoriza_ingreso, placa)
       VALUES (?, ?, ?, ?, ?)`,
      [personaId, area, elementos_ingresa, autoriza_ingreso, placa]
    );

    // 6. Obtener datos completos
    const [registroCompleto] = await connection.execute(
      `SELECT v.id, p.cedula, p.nombre, p.apellido, p.empresa,
              v.area, v.elementos_ingresa, v.autoriza_ingreso, v.placa,
              v.hora_ingreso
       FROM visitas v
       JOIN personas p ON v.persona_id = p.id
       WHERE v.id = ?`,
      [visita.insertId]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        ...registroCompleto[0],
        hora_ingreso: moment.utc(registroCompleto[0].hora_ingreso).format()
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error en transacción:', error);
    res.status(500).json({
      error: 'Error en el registro',
      detalle: error.sqlMessage || error.message
    });
  } finally {
    connection.release();
  }
});

// POST /arl - Registrar ARL
router.post('/arl', [
  body('cedula').isLength({ min: 6, max: 20 }).withMessage('Cédula inválida'),
  body('mes_vigencia').isISO8601().withMessage('Fecha inválida'),
  body('entidad_arl').notEmpty().withMessage('Entidad ARL requerida')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const connection = await req.pool.getConnection();
  try {
    const { cedula, mes_vigencia, entidad_arl } = req.body;
    
    const [[personaRow]] = await connection.execute(
      'SELECT id FROM personas WHERE cedula = ?', 
      [cedula]
    );
    
    let personaId;
    if (!personaRow) {
      const [newPersona] = await connection.execute(
        `INSERT INTO personas (cedula, nombre, apellido, empresa)
         VALUES (?, 'TEMPORAL', 'TEMPORAL', 'TEMPORAL')`,
        [cedula]
      );
      personaId = newPersona.insertId;
    } else {
      personaId = personaRow.id;
    }

    // Convertir a primer día del mes
    const primerDiaMes = moment.utc(mes_vigencia).startOf('month').format('YYYY-MM-DD');

    await connection.execute(
      `INSERT INTO arl (persona_id, mes_vigencia, entidad)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         mes_vigencia=VALUES(mes_vigencia),
         entidad=VALUES(entidad)`,
      [personaId, primerDiaMes, entidad_arl]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error al registrar ARL:', error);
    res.status(500).json({ 
      error: 'Error al registrar ARL', 
      detalle: error.sqlMessage || error.message
    });
  } finally {
    connection.release();
  }
});

// POST /eps - Registrar EPS (igual a ARL)
router.post('/eps', [
  body('cedula').isLength({ min: 6, max: 20 }).withMessage('Cédula inválida'),
  body('fecha_vencimiento').isISO8601().withMessage('Fecha inválida'),
  body('entidad_eps').notEmpty().withMessage('Entidad EPS requerida')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const connection = await req.pool.getConnection();
  try {
    const { cedula, fecha_vencimiento, entidad_eps } = req.body;
    
    const [[personaRow]] = await connection.execute(
      'SELECT id FROM personas WHERE cedula = ?', 
      [cedula]
    );
    
    let personaId;
    if (!personaRow) {
      const [newPersona] = await connection.execute(
        `INSERT INTO personas (cedula, nombre, apellido, empresa)
         VALUES (?, 'TEMPORAL', 'TEMPORAL', 'TEMPORAL')`,
        [cedula]
      );
      personaId = newPersona.insertId;
    } else {
      personaId = personaRow.id;
    }

    await connection.execute(
      `INSERT INTO eps (persona_id, fecha_vencimiento, entidad)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         fecha_vencimiento=VALUES(fecha_vencimiento),
         entidad=VALUES(entidad)`,
      [personaId, fecha_vencimiento, entidad_eps]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error al registrar EPS:', error);
    res.status(500).json({ 
      error: 'Error al registrar EPS', 
      detalle: error.sqlMessage || error.message
    });
  } finally {
    connection.release();
  }
});

// GET /visitas - Obtener visitas
router.get('/', async (req, res) => {
  const connection = await req.pool.getConnection();
  try {
    const [visitas] = await connection.execute(`
      SELECT v.id, p.cedula, p.nombre, p.apellido, p.empresa,
             v.area, v.elementos_ingresa, v.autoriza_ingreso, v.placa,
             v.hora_ingreso
      FROM visitas v
      JOIN personas p ON v.persona_id = p.id
    `);
    res.json({ data: visitas });
  } catch (error) {
    console.error('Error al obtener visitas:', error);
    res.status(500).json({ error: 'Error al obtener visitas' });
  } finally {
    connection.release();
  }
});

module.exports = router;



