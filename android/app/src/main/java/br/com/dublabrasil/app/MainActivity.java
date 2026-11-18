package br.com.dublabrasil.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Tamanho padrão do app: não aumenta as letras quando o celular está com "fonte grande"
        // (senão os botões do topo não cabem e a tela fica desproporcional).
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setTextZoom(100);
        }
    }
}
