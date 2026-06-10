export interface Database {
  public: {
    Tables: {
      produtos_mestre: {
        Row: { id: string; nome: string; categoria: string | null; tipo: "comprado" | "montado"; custo_manual: number | null; preco_manual: number | null; codigo: string | null; unidade: string | null; unidade_secundaria: string | null; fator_conversao: number | null; mais_vendido: boolean; created_at: string };
        Insert: { id?: string; nome: string; categoria?: string | null; tipo?: "comprado" | "montado"; custo_manual?: number | null; preco_manual?: number | null; codigo?: string | null; unidade?: string | null; unidade_secundaria?: string | null; fator_conversao?: number | null; mais_vendido?: boolean; created_at?: string };
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
      config_markup: {
        Row: { id: number; vendas: number; marketing: number; custo_operacional: number; ipi: number; icms: number; pis: number; cofins: number; csll: number; ir: number; lucro: number; desgaste_maquinas: number; frete: number };
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
