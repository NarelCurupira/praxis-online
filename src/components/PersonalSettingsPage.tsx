import { DeviceAccessPanel } from "./DeviceAccessPanel";

export function PersonalSettingsPage() {
  return (
    <div className="page-stack personal-settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Acesso pessoal</p>
          <h1>Configurações</h1>
          <p>Configure o acesso por biometria ou passkey neste dispositivo.</p>
        </div>
      </div>
      <DeviceAccessPanel />
      <p className="personal-settings-note">
        As configurações institucionais, de equipe, prazos e relatórios são administradas exclusivamente pelo perfil administrador.
      </p>
    </div>
  );
}
