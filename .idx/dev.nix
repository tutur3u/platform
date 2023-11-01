{ pkgs, ... }: {
    # Which nixpkgs channel to use.
    channel = "stable-23.05"; # or "unstable"

    # Use https://search.nixos.org/packages to find packages
    packages = [
      pkgs.nodejs_20
    ];

    # Sets environment variables in the workspace
    env = {};

    services.docker.enable = true;
}