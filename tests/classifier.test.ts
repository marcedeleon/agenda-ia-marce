import { describe, it, expect } from 'vitest';
import { parseClassification } from '../src/services/gemini/classifier.js';

describe('parseClassification', () => {
  it('clasifica una tarea con fecha relativa resuelta', () => {
    const classified = parseClassification(
      JSON.stringify({
        intent: 'crear_tarea',
        tarea: {
          titulo: 'Pagar la expensa',
          descripcion: null,
          fecha: '2026-09-18',
          hora: '9:30',
          recurrencia: {
            frecuencia: 'semanal',
            intervalo: 1,
            dia_semana: 4,
            dia_mes: null,
            hasta: null,
          },
        },
        consulta_fecha: null,
      }),
    );

    expect(classified.intent).toBe('crear_tarea');
    expect(classified.task?.titulo).toBe('Pagar la expensa');
    expect(classified.task?.fecha).toBe('2026-09-18');
    expect(classified.task?.hora).toBe('09:30');
    expect(classified.task?.recurrencia?.frecuencia).toBe('semanal');
  });

  it('normaliza mayúsculas y acentos de la consulta', () => {
    const classified = parseClassification(
      JSON.stringify({ intent: 'CONSULTAR_AGENDA', consulta_fecha: 'MAÑANA' }),
    );
    expect(classified.intent).toBe('consultar_agenda');
    expect(classified.queryReference).toBe('manana');
  });

  it('vuelve a "otros" si no responde JSON', () => {
    const classified = parseClassification('no respondo json');
    expect(classified.intent).toBe('otros');
  });

  it('vuelve a "otros" si falta el título de la tarea', () => {
    const classified = parseClassification(
      JSON.stringify({ intent: 'crear_tarea', tarea: { titulo: '' } }),
    );
    expect(classified.intent).toBe('otros');
  });
});
