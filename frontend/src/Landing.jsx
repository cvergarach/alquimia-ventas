import React from 'react'
import './Landing.css'

function Landing({ onLogin }) {
    return (
        <div className="landing-container">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-content">
                    <div className="logo-large">A</div>
                    <h1 className="hero-title">ALQUIMIA</h1>
                    <p className="hero-subtitle">Dashboard Inteligente de Análisis de Ventas</p>
                    <p className="hero-description">
                        Combina visualización de datos en tiempo real con inteligencia artificial conversacional
                        para tomar decisiones estratégicas basadas en datos.
                    </p>
                    <button className="cta-button" onClick={onLogin}>
                        Ingresar al Dashboard →
                    </button>
                </div>
            </section>

            {/* Features Section */}
            <section className="features">
                <div className="container">
                    <h2 className="section-title">Funcionalidades Principales</h2>

                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>Dashboard Visual Interactivo</h3>
                            <p>Métricas clave (KPIs) en tarjetas visuales con gráficos de tendencias, canales y marcas. Actualización automática con filtros.</p>
                            <ul className="feature-list">
                                <li>Total Unidades vendidas</li>
                                <li>Ingreso Bruto</li>
                                <li>Costo Total</li>
                                <li>Margen Neto</li>
                            </ul>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">🔍</div>
                            <h3>Filtros Avanzados</h3>
                            <p>Sistema de filtros buscables para analizar exactamente lo que necesitas.</p>
                            <ul className="feature-list">
                                <li>Rango de fechas personalizado</li>
                                <li>Canal (E-commerce, tiendas, etc.)</li>
                                <li>Marca (Apple, Samsung, etc.)</li>
                                <li>Sucursal (+100 sucursales)</li>
                            </ul>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">💬</div>
                            <h3>Chat con IA</h3>
                            <p>Pregunta en lenguaje natural y obtén insights ejecutivos al instante.</p>
                            <ul className="feature-list">
                                <li>"¿Cómo voy hoy?"</li>
                                <li>"Qué canal vende más"</li>
                                <li>"Top 10 SKUs del mes"</li>
                                <li>"Análisis de rentabilidad"</li>
                            </ul>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">📄</div>
                            <h3>Carga Masiva CSV</h3>
                            <p>Importa miles de registros desde Excel/CSV con procesamiento automático.</p>
                            <ul className="feature-list">
                                <li>+55,000 registros sin problemas</li>
                                <li>Formato chileno automático</li>
                                <li>Procesamiento en lotes</li>
                                <li>Velocidad máxima</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Use Cases Section */}
            <section className="use-cases">
                <div className="container">
                    <h2 className="section-title">Casos de Uso Reales</h2>

                    <div className="use-cases-grid">
                        <div className="use-case">
                            <h3>⏱️ Monitoreo Diario</h3>
                            <p className="use-case-scenario">Es lunes 8:00 AM. El jefe de canal quiere saber cómo fue el fin de semana.</p>
                            <ol className="use-case-steps">
                                <li>Abre Alquimia y ve totales del fin de semana</li>
                                <li>Pregunta: "¿Cómo fue el sábado vs domingo?"</li>
                                <li>AI compara y muestra que sábado vendió 30% más</li>
                                <li>Toma acción basada en insights</li>
                            </ol>
                            <p className="use-case-time">⚡ Tiempo total: 3 minutos</p>
                        </div>

                        <div className="use-case">
                            <h3>📈 Análisis de Campaña</h3>
                            <p className="use-case-scenario">Marketing lanzó campaña de iPhone. ¿Funcionó?</p>
                            <ol className="use-case-steps">
                                <li>Filtra: Marca=Apple, Fecha=última semana</li>
                                <li>Ve que unidades subieron 50%</li>
                                <li>Pregunta: "¿En qué canal se vendió más?"</li>
                                <li>AI responde con desglose detallado</li>
                            </ol>
                            <p className="use-case-time">✅ Resultado: Campaña exitosa en E-commerce</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tips Section */}
            <section className="tips">
                <div className="container">
                    <h2 className="section-title">Tips y Mejores Prácticas</h2>

                    <div className="tips-grid">
                        <div className="tip">
                            <h4>💡 Usa filtros combinados</h4>
                            <p>Combina múltiples filtros para análisis profundos. Ejemplo: "Ventas de iPhone en E-commerce en Santiago durante Black Friday"</p>
                        </div>

                        <div className="tip">
                            <h4>🔎 Búsqueda inteligente</h4>
                            <p>Con +100 sucursales, usa la búsqueda. Escribe "Puente" y aparecerá "CAC Puente Alto" instantáneamente.</p>
                        </div>

                        <div className="tip">
                            <h4>🎯 Sé específico con el AI</h4>
                            <p>En lugar de "productos menos vendidos", prueba "productos de E-commerce del 6 de enero ordenados por cantidad ascendente"</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="container">
                    <h2>¿Listo para transformar tus datos en decisiones?</h2>
                    <button className="cta-button large" onClick={onLogin}>
                        Ingresar al Dashboard →
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <p>© 2026 Alquimia - Dashboard Inteligente de Análisis de Ventas</p>
            </footer>
        </div>
    )
}

export default Landing
