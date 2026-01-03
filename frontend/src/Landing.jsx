import React from 'react'
import './Landing.css'

function Landing({ onLogin }) {
    return (
        <div className="landing">
            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-container">
                    <div className="brand-name">ALQUIMIA</div>

                    <h1 className="hero-headline">
                        ¿Cuántas horas perdiste esta semana<br />
                        interpretando reportes de ventas?
                    </h1>

                    <p className="hero-subheadline">
                        Alquimia convierte tus datos de ventas en decisiones estratégicas.<br />
                        Pregunta en lenguaje natural, obtén respuestas ejecutivas en segundos.
                    </p>

                    <div className="hero-cta">
                        <button className="cta-primary" onClick={onLogin}>
                            Analiza tus ventas ahora
                        </button>
                    </div>

                    <div className="hero-visual">
                        <div className="dashboard-preview">
                            <div className="kpi-row">
                                <div className="kpi-mini">
                                    <span className="kpi-label">Total Unidades</span>
                                    <span className="kpi-value">12,847</span>
                                </div>
                                <div className="kpi-mini">
                                    <span className="kpi-label">Ingreso Bruto</span>
                                    <span className="kpi-value">$285M</span>
                                </div>
                                <div className="kpi-mini">
                                    <span className="kpi-label">Margen Neto</span>
                                    <span className="kpi-value">$42M</span>
                                </div>
                            </div>
                            <div className="chat-bubble">
                                <div className="chat-question">¿Cómo voy hoy?</div>
                                <div className="chat-answer">
                                    Hoy llevas 847 unidades vendidas, 18% más que ayer.
                                    E-commerce lidera con 52% del total...
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* El Problema Invisible */}
            <section className="problem-section">
                <div className="content-container">
                    <h2 className="section-title">
                        El lunes a las 8 AM, no deberías estar armando Excel
                    </h2>

                    <div className="problem-grid">
                        <div className="problem-stat">
                            <p className="stat-number">5 horas/semana</p>
                            <p className="stat-text">filtrando datos manualmente</p>
                        </div>
                        <div className="problem-stat">
                            <p className="stat-number">Decisiones basadas</p>
                            <p className="stat-text">en reportes de hace 2 días</p>
                        </div>
                        <div className="problem-stat">
                            <p className="stat-number">Insights perdidos</p>
                            <p className="stat-text">entre miles de filas</p>
                        </div>
                    </div>

                    <p className="problem-closer">
                        Mientras armas reportes, tus competidores ya tomaron la decisión.
                    </p>
                </div>
            </section>

            {/* Lo Que Realmente Obtienes */}
            <section className="results-section">
                <div className="content-container">
                    <div className="result-card">
                        <div className="result-content">
                            <h3>De "necesito el reporte" a "ya tomé la decisión"</h3>
                            <p>
                                Aplica filtros en tiempo real: iPhone + E-commerce + Última semana.<br />
                                Ve el resultado en 3 segundos, no en 3 horas.
                            </p>
                        </div>
                        <div className="result-visual">
                            <div className="filter-demo">
                                <div className="filter-bar">
                                    <span className="filter-item">Marca: Apple</span>
                                    <span className="filter-item">Canal: E-commerce</span>
                                    <span className="filter-item">Fecha: Última semana</span>
                                </div>
                                <div className="result-instant">
                                    <span className="result-label">Resultado instantáneo</span>
                                    <span className="result-number">2,847 unidades • $64M</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="result-card reverse">
                        <div className="result-content">
                            <h3>Habla con tus datos como hablarías con tu analista senior</h3>
                            <p>
                                Pregunta: "¿Qué canal vendió más en Black Friday?"<br />
                                El AI analiza +55,000 registros y te da la respuesta ejecutiva.
                            </p>
                        </div>
                        <div className="result-visual">
                            <div className="chat-demo">
                                <div className="chat-msg user">¿Qué canal vendió más en Black Friday?</div>
                                <div className="chat-msg ai">
                                    E-commerce lideró con 8,234 unidades (62% del total).
                                    Tiendas físicas: 3,891 unidades. Distribuidores: 1,023 unidades.
                                    Margen promedio E-commerce: 18.5%
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="result-card">
                        <div className="result-content">
                            <h3>Sabe más de tu negocio el lunes que el viernes</h3>
                            <p>
                                Dashboard en vivo. Actualización automática. Cero espera.<br />
                                Margen neto, costos, rentabilidad: todo calculado.
                            </p>
                        </div>
                        <div className="result-visual">
                            <div className="live-dashboard">
                                <div className="live-indicator">
                                    <span className="pulse"></span>
                                    Actualizado hace 2 segundos
                                </div>
                                <div className="metric-row">
                                    <div className="metric">
                                        <span>Margen Neto</span>
                                        <strong>$42.8M</strong>
                                    </div>
                                    <div className="metric">
                                        <span>Eficiencia</span>
                                        <strong>15.2%</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Por Qué Funciona */}
            <section className="why-section">
                <div className="content-container">
                    <h2 className="section-title">La inteligencia que no ves</h2>

                    <div className="why-list">
                        <div className="why-item">
                            <h4>Procesamiento masivo invisible</h4>
                            <p>
                                Carga 55,000+ registros mientras tomas café.
                                Procesamiento paralelo optimizado.
                            </p>
                        </div>

                        <div className="why-item">
                            <h4>Comprensión del contexto chileno</h4>
                            <p>
                                Reconoce $1.234,56 automáticamente. Normaliza nombres de columnas
                                inconsistentes. Funciona con TUS datos tal como están.
                            </p>
                        </div>

                        <div className="why-item">
                            <h4>AI entrenado en lenguaje de ventas</h4>
                            <p>
                                No necesitas SQL. Pregunta "Top 10 SKUs" o "productos menos vendidos
                                en E-commerce". El AI entiende tu negocio.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Caso de Uso Real */}
            <section className="case-section">
                <div className="content-container">
                    <h2 className="section-title">Lunes 8:00 AM - Jefe de Canal</h2>

                    <div className="timeline">
                        <div className="timeline-step">
                            <span className="time">8:01</span>
                            <p>Abre Alquimia, ve totales del fin de semana</p>
                        </div>
                        <div className="timeline-step">
                            <span className="time">8:02</span>
                            <p>Pregunta: "¿Cómo fue sábado vs domingo?"</p>
                        </div>
                        <div className="timeline-step">
                            <span className="time">8:03</span>
                            <p>AI responde: "Sábado vendió 30% más. Desglose por canal..."</p>
                        </div>
                    </div>

                    <div className="case-result">
                        <p className="result-highlight">Decisión tomada en 3 minutos.</p>
                        <p className="result-before">Antes: Esperaba hasta el miércoles por el reporte.</p>
                    </div>
                </div>
            </section>

            {/* Prueba Social */}
            <section className="social-proof">
                <div className="content-container">
                    <p className="metric-big">55,000+ registros de ventas analizados en tiempo real</p>

                    <blockquote className="testimonial">
                        "Antes tardábamos 4 horas en preparar el reporte semanal.
                        Ahora pregunto y tengo la respuesta en segundos."
                        <cite>— Gerente Comercial, Retail Tecnología</cite>
                    </blockquote>
                </div>
            </section>

            {/* CTA Final */}
            <section className="final-cta">
                <div className="content-container">
                    <h2 className="cta-title">Tu próxima reunión de ventas puede ser diferente</h2>

                    <div className="cta-buttons">
                        <button className="cta-primary large" onClick={onLogin}>
                            Prueba con tus datos
                        </button>
                        <button className="cta-secondary-btn">
                            Agenda demo personalizada
                        </button>
                    </div>

                    <p className="cta-microcopy">
                        Importa tu CSV. Sin setup técnico. Resultados en minutos.
                    </p>
                </div>
            </section>

            {/* Footer Minimal */}
            <footer className="landing-footer">
                <p>© 2026 Alquimia — Dashboard Inteligente de Análisis de Ventas</p>
            </footer>
        </div>
    )
}

export default Landing
