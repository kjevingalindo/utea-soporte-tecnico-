const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Boolean(process.env.SMTP_SECURE === 'true'),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || ''
        }
    });
}

async function enviarCorreoInstitucional(para, asunto, tituloTicket, mensajeDetalle, ticketId) {
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0b3f8a; color: #ffffff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">UNIVERSIDAD TECNOLÓGICA DE LOS ANDES</h2>
            <p style="margin: 5px 0 0 0; font-size: 13px; color: #bfdbfe;">Oficina de Tecnologías de Información • Sede Andahuaylas</p>
        </div>
        <div style="padding: 24px; color: #1e293b; background-color: #ffffff;">
            <h3 style="color: #0b3f8a; margin-top: 0;">Notificación Help Desk UTEA</h3>
            <p style="font-size: 14px; line-height: 1.5;">${mensajeDetalle}</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #0b3f8a; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 13px; font-weight: bold; color: #334155;">Ticket #${ticketId || 'N/A'}</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #0f172a;">${tituloTicket || ''}</p>
            </div>
            <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
                Puedes consultar el estado o responder agregando comentarios a través de la plataforma web AuraDesk.
            </p>
        </div>
        <div style="background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
            Sistema de Gestión de Tickets UTEA • Sede Andahuaylas
        </div>
    </div>
    `;

    if (!transporter) {
        console.log(`[SIMULACIÓN CORREO] Para: ${para} | Asunto: ${asunto} | Mensaje: ${mensajeDetalle}`);
        return { simulated: true };
    }

    try {
        const info = await transporter.sendMail({
            from: `"Soporte TI UTEA" <${process.env.SMTP_USER}>`,
            to: para,
            subject: asunto,
            html: htmlContent
        });
        console.log(`[CORREO ENVIADO] ID: ${info.messageId} a ${para}`);
        return info;
    } catch (error) {
        console.error(`[ERROR CORREO] No se pudo enviar a ${para}:`, error.message);
        return { error: error.message };
    }
}

module.exports = { enviarCorreoInstitucional };
