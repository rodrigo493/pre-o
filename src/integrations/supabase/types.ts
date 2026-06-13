export interface Database {
  public: {
    Tables: {
      produtos_mestre: {
        Row: { id: string; nome: string; categoria: string | null; tipo: "comprado" | "montado"; custo_manual: number | null; preco_manual: number | null; codigo: string | null; unidade: string | null; unidade_secundaria: string | null; fator_conversao: number | null; conversao_op: "dividir" | "multiplicar" | null; mais_vendido: boolean; soma_nota: boolean; tempo_corte_min: number | null; created_at: string };
        Insert: { id?: string; nome: string; categoria?: string | null; tipo?: "comprado" | "montado"; custo_manual?: number | null; preco_manual?: number | null; codigo?: string | null; unidade?: string | null; unidade_secundaria?: string | null; fator_conversao?: number | null; conversao_op?: "dividir" | "multiplicar" | null; mais_vendido?: boolean; soma_nota?: boolean; tempo_corte_min?: number | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["produtos_mestre"]["Insert"]>;
        Relationships: [];
      };
      notas: {
        Row: { id: string; numero: string | null; chave: string | null; fornecedor: string | null; data_emissao: string; origem: "xml" | "pdf"; arquivo_nome: string | null; created_at: string };
        Insert: { id?: string; numero?: string | null; chave?: string | null; fornecedor?: string | null; data_emissao: string; origem: "xml" | "pdf"; arquivo_nome?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["notas"]["Insert"]>;
        Relationships: [];
      };
      itens_nota: {
        Row: { id: string; nota_id: string; cprod: string; descricao: string; unidade: string | null; custo_unitario: number; quantidade: number | null; vicms: number | null; vipi: number | null; vpis: number | null; vcofins: number | null; produto_mestre_id: string | null; created_at: string };
        Insert: { id?: string; nota_id: string; cprod: string; descricao: string; unidade?: string | null; custo_unitario: number; quantidade?: number | null; vicms?: number | null; vipi?: number | null; vpis?: number | null; vcofins?: number | null; produto_mestre_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["itens_nota"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "itens_nota_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "notas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itens_nota_produto_mestre_id_fkey";
            columns: ["produto_mestre_id"];
            isOneToOne: false;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
        ];
      };
      vinculos_cprod: {
        Row: { cprod: string; produto_mestre_id: string; fator_conversao: number | null; created_at: string };
        Insert: { cprod: string; produto_mestre_id: string; fator_conversao?: number | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["vinculos_cprod"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "vinculos_cprod_produto_mestre_id_fkey";
            columns: ["produto_mestre_id"];
            isOneToOne: false;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
        ];
      };
      componentes_montado: {
        Row: { id: string; montado_id: string; componente_id: string; quantidade: number; created_at: string };
        Insert: { id?: string; montado_id: string; componente_id: string; quantidade?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["componentes_montado"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "componentes_montado_montado_id_fkey";
            columns: ["montado_id"];
            isOneToOne: false;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "componentes_montado_componente_id_fkey";
            columns: ["componente_id"];
            isOneToOne: false;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
        ];
      };
      config_chapas: {
        Row: { espessura: number; chapa_codigo: string; area_mm2: number; peso_kg: number; produto_mestre_id: string | null };
        Insert: { espessura: number; chapa_codigo: string; area_mm2: number; peso_kg: number; produto_mestre_id?: string | null };
        Update: Partial<Database["public"]["Tables"]["config_chapas"]["Insert"]>;
        Relationships: [];
      };
      pecas_laser: {
        Row: { produto_mestre_id: string; espessura: number; largura_mm: number; comprimento_mm: number; tempo_corte_seg: number; updated_at: string };
        Insert: { produto_mestre_id: string; espessura: number; largura_mm: number; comprimento_mm: number; tempo_corte_seg?: number; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["pecas_laser"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pecas_laser_produto_mestre_id_fkey";
            columns: ["produto_mestre_id"];
            isOneToOne: true;
            referencedRelation: "produtos_mestre";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pecas_laser_espessura_fkey";
            columns: ["espessura"];
            isOneToOne: false;
            referencedRelation: "config_chapas";
            referencedColumns: ["espessura"];
          },
        ];
      };
      config_bitolas: {
        Row: { id: string; tipo: "trefilado" | "plastico"; nome: string; produto_mestre_id: string | null; comprimento_barra_mm: number; peso_barra_kg: number | null };
        Insert: { id?: string; tipo: "trefilado" | "plastico"; nome: string; produto_mestre_id?: string | null; comprimento_barra_mm: number; peso_barra_kg?: number | null };
        Update: Partial<Database["public"]["Tables"]["config_bitolas"]["Insert"]>;
        Relationships: [];
      };
      pecas_usinado: {
        Row: { produto_mestre_id: string; bitola_trefilado_id: string | null; bitola_plastico_id: string | null; comprimento_mm: number; mao_de_obra: number; updated_at: string };
        Insert: { produto_mestre_id: string; bitola_trefilado_id?: string | null; bitola_plastico_id?: string | null; comprimento_mm?: number; mao_de_obra?: number; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["pecas_usinado"]["Insert"]>;
        Relationships: [];
      };
      config_markup: {
        Row: { id: number; vendas: number; marketing: number; custo_operacional: number; ipi: number; icms: number; pis: number; cofins: number; csll: number; ir: number; lucro: number; desgaste_maquinas: number; frete: number; valor_hora_laser: number };
        Insert: Partial<Database["public"]["Tables"]["config_markup"]["Row"]> & { id?: number };
        Update: Partial<Database["public"]["Tables"]["config_markup"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
