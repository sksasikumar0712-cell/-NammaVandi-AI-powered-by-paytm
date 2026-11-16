declare module "paytmchecksum" {
  const checksum: {
    generateSignature(
      params: string | Record<string, string>,
      key: string,
    ): Promise<string>;
    verifySignature(
      params: string | Record<string, string>,
      key: string,
      signature: string,
    ): boolean;
  };
  export default checksum;
}
