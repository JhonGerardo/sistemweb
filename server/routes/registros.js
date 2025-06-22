const express = require('express');
const router = express.Router();

// Validación de campos obligatorios
const validarRegistro = (req, res, next) => {
  const { nombre, apellido, hora_ingreso } = req.body;
  if (!nombre || !apellido || !hora_ingreso) {
    return res.status(400).json({ error: 'Nombre, apellido y hora son obligatorios' });
  }
  next();
};

// Crear registro (gestión automática de empleados)
router.post('/', validarRegistro, async (req, res) => {
  try {
    const { nombre, apellido, placa, hora_ingreso } = req.body;
    // Buscar o crear empleado
    let [empleado] = await req.pool.execute(
      'SELECT id FROM empleados WHERE nombre = ? AND apellido = ?',
      [nombre.trim(), apellido.trim()]
    );
    if (empleado.length === 0) {
      const [newEmpleado] = await req.pool.execute(
        'INSERT INTO empleados(nombre, apellido, placa) VALUES (?, ?, ?)',
        [nombre, apellido, placa || null]
      );
      empleado = { id: newEmpleado.insertId };
    } else {
      empleado = empleado[0];
    }
    // Insertar registro
    const [result] = await req.pool.execute(
      'INSERT INTO registros(empleado_id, hora_ingreso) VALUES (?, ?)',
      [empleado.id, hora_ingreso]
    );
    // Obtener registro completo
    const [registro] = await req.pool.execute(`
      SELECT 
        r.id,
        DATE_FORMAT(r.hora_ingreso, '%Y-%m-%dT%H:%i') AS hora_ingreso,
        e.nombre,
        e.apellido,
        e.placa
      FROM registros r
      JOIN empleados e ON r.empleado_id = e.id
      WHERE r.id = ?
    `, [result.insertId]);
    res.status(201).json(registro[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear registro' });
  }
});

// Listar registros
router.get('/', async (req, res) => {
  try {
    const [rows] = await req.pool.query(`
      SELECT 
        r.id,
        DATE_FORMAT(r.hora_ingreso, '%Y-%m-%dT%H:%i') AS hora_ingreso,
        e.nombre,
        e.apellido,
        e.placa
      FROM registros r
      JOIN empleados e ON r.empleado_id = e.id
      ORDER BY r.hora_ingreso DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

// Obtener registro por id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await req.pool.execute(`
      SELECT 
        r.id,
        DATE_FORMAT(r.hora_ingreso, '%Y-%m-%dT%H:%i') AS hora_ingreso,
        e.nombre,
        e.apellido,
        e.placa
      FROM registros r
      JOIN empleados e ON r.empleado_id = e.id
      WHERE r.id = ?
    `, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener registro' });
  }
});

// Actualizar registro
router.put('/:id', validarRegistro, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, placa, hora_ingreso } = req.body;
    // Obtener empleado_id del registro
    const [registro] = await req.pool.execute(
      'SELECT empleado_id FROM registros WHERE id = ?',
      [id]
    );
    if (registro.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    const empleado_id = registro[0].empleado_id;
    // Actualizar empleado
    await req.pool.execute(
      'UPDATE empleados SET nombre = ?, apellido = ?, placa = ? WHERE id = ?',
      [nombre, apellido, placa || null, empleado_id]
    );
    // Actualizar registro
    await req.pool.execute(
      'UPDATE registros SET hora_ingreso = ? WHERE id = ?',
      [hora_ingreso, id]
    );
    // Obtener registro actualizado
    const [updatedRegistro] = await req.pool.execute(`
      SELECT 
        r.id,
        DATE_FORMAT(r.hora_ingreso, '%Y-%m-%dT%H:%i') AS hora_ingreso,
        e.nombre,
        e.apellido,
        e.placa
      FROM registros r
      JOIN empleados e ON r.empleado_id = e.id
      WHERE r.id = ?
    `, [id]);
    res.json(updatedRegistro[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar registro' });
  }
});

// Eliminar registro
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await req.pool.execute('DELETE FROM registros WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ message: 'Registro eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar registro' });
  }
});

module.exports = router;
