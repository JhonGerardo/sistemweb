const express = require('express');
const router = express.Router();

// Validación de campos obligatorios
const validarEmpleado = (req, res, next) => {
  const { nombre, apellido } = req.body;
  if (!nombre || !apellido) {
    return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
  }
  next();
};

// Crear empleado
router.post('/', validarEmpleado, async (req, res) => {
  try {
    const { nombre, apellido, placa } = req.body;
    const [result] = await req.pool.execute(
      'INSERT INTO empleados(nombre, apellido, placa) VALUES (?, ?, ?)',
      [nombre, apellido, placa || null]
    );
    const [nuevo] = await req.pool.execute(
      'SELECT * FROM empleados WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(nuevo[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

// Listar empleados
router.get('/', async (req, res) => {
  try {
    const [rows] = await req.pool.query('SELECT * FROM empleados ORDER BY apellido, nombre');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

// Obtener empleado por id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await req.pool.execute(
      'SELECT * FROM empleados WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleado' });
  }
});

// Actualizar empleado
router.put('/:id', validarEmpleado, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, placa } = req.body;
    await req.pool.execute(
      'UPDATE empleados SET nombre = ?, apellido = ?, placa = ? WHERE id = ?',
      [nombre, apellido, placa || null, id]
    );
    const [actualizado] = await req.pool.execute(
      'SELECT * FROM empleados WHERE id = ?',
      [id]
    );
    res.json(actualizado[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
});

// Eliminar empleado
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await req.pool.execute(
      'DELETE FROM empleados WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }
    res.json({ message: 'Empleado eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
});

module.exports = router;

